#!/usr/bin/env node
import webpush from 'web-push';

const vapidKeys = webpush.generateVAPIDKeys();
console.log('Add these to your environment variables:\n');
console.log(`VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`);
console.log(`VAPID_SUBJECT=mailto:admin@cleanplatefx.com`);
console.log('\nPublic key (also put this in src/api/notifications.js):');
console.log(vapidKeys.publicKey);
