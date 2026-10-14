// HabitFlow Service Worker — Background Alarms & Offline Caching
const CACHE_NAME = 'habitflow-v3';
const STATIC_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './icon-192.png',
    './icon-512.png',
    './apple-touch-icon.png',
    './favicon.png',
    './icon.svg'
];

let backgroundAlarms = {};

// Install Event
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS);
        })
    );
    self.skipWaiting();
});

// Activate Event
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch Event (Offline support)
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    event.respondWith(
        fetch(event.request).catch(() => {
            return caches.match(event.request).then((res) => {
                if (res) return res;
                if (event.request.mode === 'navigate') {
                    return caches.match('./index.html');
                }
            });
        })
    );
});

// Handle Background Messages from the App
self.addEventListener('message', (event) => {
    if (!event.data) return;

    if (event.data.type === 'SCHEDULE_ALARMS') {
        const alarms = event.data.alarms || [];
        
        // Clear previous timers
        Object.values(backgroundAlarms).forEach(clearTimeout);
        backgroundAlarms = {};

        const now = Date.now();
        alarms.forEach((alarm) => {
            const delay = alarm.targetTime - now;
            if (delay > 0) {
                // Schedule timer in Service Worker
                backgroundAlarms[alarm.id] = setTimeout(() => {
                    fireAlarmNotification(alarm);
                }, delay);

                // If Notification Triggers API (TimestampTrigger) is supported
                if ('showTrigger' in Notification.prototype && typeof TimestampTrigger !== 'undefined') {
                    try {
                        self.registration.showNotification(`⏰ ${alarm.name}`, {
                            showTrigger: new TimestampTrigger(alarm.targetTime),
                            body: `${alarm.emoji} HabitFlow: Time to complete "${alarm.name}"!`,
                            icon: './icon-192.png',
                            badge: './icon-192.png',
                            vibrate: [200, 100, 200, 100, 200, 100, 400],
                            tag: 'habit-alarm-' + alarm.id,
                            requireInteraction: true,
                            renotify: true,
                            data: { id: alarm.id, name: alarm.name, time: alarm.time },
                            actions: [
                                { action: 'done', title: '✓ Mark Done' },
                                { action: 'open', title: '🔔 Open Alarm' }
                            ]
                        });
                    } catch (e) {
                        // Fallback to setTimeout timer
                    }
                }
            }
        });
    }
});

// Trigger Notification
function fireAlarmNotification(alarm) {
    self.registration.showNotification(`⏰ ${alarm.name}`, {
        body: `${alarm.emoji} HabitFlow: Time to complete "${alarm.name}"!`,
        icon: './icon-192.png',
        badge: './icon-192.png',
        vibrate: [200, 100, 200, 100, 200, 100, 400],
        tag: 'habit-alarm-' + alarm.id,
        requireInteraction: true,
        renotify: true,
        data: { id: alarm.id, name: alarm.name, time: alarm.time },
        actions: [
            { action: 'done', title: '✓ Mark Done' },
            { action: 'open', title: '🔔 Open Alarm' }
        ]
    });
}

// Notification Click Event
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const action = event.action;
    const habitId = event.notification.data ? event.notification.data.id : null;

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if ('focus' in client) {
                    if (action === 'done' && habitId) {
                        client.postMessage({ type: 'ALARM_MARK_DONE', habitId });
                    } else if (habitId) {
                        client.postMessage({ type: 'TRIGGER_ALARM_NOW', habitId });
                    }
                    return client.focus();
                }
            }

            // If no window is currently open, open a new window
            let url = './index.html';
            if (action === 'done' && habitId) {
                url += `?markDone=${habitId}`;
            } else if (habitId) {
                url += `?alarmId=${habitId}`;
            }
            return self.clients.openWindow(url);
        })
    );
});
