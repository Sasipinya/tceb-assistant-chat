// utils/uuid.ts
export function generateUUID() {
  // ฝั่ง browser: ใช้ Web Crypto ถ้ามี
  if (typeof window !== 'undefined' &&
      window.crypto &&
      typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }

  // ฝั่ง server (Node 22+) เผื่อคุณเรียกจากโค้ด server อื่น ๆ
  if (typeof window === 'undefined') {
    // ใช้ require แบบ lazy เพื่อไม่ให้ bundler ดึงเข้า client
    // @ts-ignore
    const { randomUUID } = require('crypto');
    return randomUUID();
  }

  // fallback เบา ๆ สำหรับ browser ที่ไม่รองรับ/ถูก override
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
