import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Initializing database with example configuration...');

  // Создаем узел связи
  const connectionNode = await prisma.connectionNode.upsert({
    where: { id: 'example-node-id' },
    update: {},
    create: {
      id: 'example-node-id',
      name: 'COM RTU MASTER',
      type: 'COM_RTU_MASTER',
      comPort: 'COM3',
      baudRate: 9600,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      enabled: true,
    },
  });

  console.log('Created connection node:', connectionNode.name);

  // Создаем устройство
  const device = await prisma.device.upsert({
    where: { id: 'example-device-id' },
    update: {},
    create: {
      id: 'example-device-id',
      connectionNodeId: connectionNode.id,
      name: 'trm',
      address: 17, // 0x11
      responseTimeout: 1000,
      pollInterval: 1000,
      enabled: true,
      status: 'unknown',
    },
  });

  console.log('Created device:', device.name);

  // Создаем тег
  const tag = await prisma.tag.upsert({
    where: { id: 'example-tag-id' },
    update: {},
    create: {
      id: 'example-tag-id',
      deviceId: device.id,
      name: 'темп',
      address: 1, // 0x0001
      registerType: 'HOLDING_REGISTER',
      deviceDataType: 'int16',
      serverDataType: 'int32',
      accessType: 'ReadOnly',
      enabled: true,
    },
  });

  console.log('Created tag:', tag.name);
  console.log('\nExample configuration created successfully!');
  console.log('\nYou can now:');
  console.log('1. Edit the COM port in the configuration if needed');
  console.log('2. Start the server: npm run dev');
  console.log('3. Open the client: http://localhost:5173');
}

main()
  .catch((e) => {
    console.error('Error initializing database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
