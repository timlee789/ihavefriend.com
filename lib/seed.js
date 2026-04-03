// lib/seed.js — Create default admin on first run
import { prisma } from './prisma';
import bcrypt from 'bcryptjs';

let seeded = false;

export async function seedAdmin() {
  if (seeded) return;
  seeded = true;
  try {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@companionai.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin1234';
    const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
    if (!existing) {
      const hash = await bcrypt.hash(adminPassword, 10);
      const admin = await prisma.user.create({
        data: {
          email: adminEmail,
          passwordHash: hash,
          name: 'Admin',
          role: 'admin',
          avatarChosen: true,
        },
      });
      await prisma.userLimit.create({ data: { userId: admin.id } });
      await prisma.userMemory.create({ data: { userId: admin.id } });
      console.log(`✅ Admin created: ${adminEmail} / ${adminPassword}`);
    }
  } catch (e) {
    console.error('Seed error:', e.message);
  }
}
