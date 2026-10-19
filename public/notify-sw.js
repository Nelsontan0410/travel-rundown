// 2026-10-19：点手机通知 → 打开（或切回）App 并跳到对应页面。由 Service Worker 通过 importScripts 载入。
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          c.focus();
          if ('navigate' in c) return c.navigate(url);
          return undefined;
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
