import prisma from './lib/prisma.js'
import bcrypt from 'bcryptjs'

async function seed() {
  console.log('Seeding database...')

  // Create admin user
  const existing = await prisma.user.findUnique({ where: { email: 'admin@fiscal.com' } })
  if (!existing) {
    const password = await bcrypt.hash('Admin@123', 10)
    await prisma.user.create({
      data: {
        name: 'Administrador',
        email: 'admin@fiscal.com',
        password,
        role: 'ADMIN',
      },
    })
    console.log('Admin user created: admin@fiscal.com / Admin@123')
  } else {
    console.log('Admin user already exists')
  }

  await prisma.$disconnect()
  console.log('Seed complete.')
}

seed().catch((e) => {
  console.error(e)
  prisma.$disconnect()
  process.exit(1)
})
