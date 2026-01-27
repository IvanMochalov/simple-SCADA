import {defineConfig, loadEnv} from 'vite'
import react from '@vitejs/plugin-react'
import {readFileSync, existsSync} from 'fs'
import {resolve} from 'path'

export default defineConfig(({mode}) => {
  // Загружаем переменные окружения из .env файла
  // Используем loadEnv для переменных с префиксом VITE_
  const viteEnv = loadEnv(mode, process.cwd(), 'VITE_');
  
  // Вручную читаем .env файл для переменных без префикса (например, CLIENT_HOST)
  const envFilePath = resolve(process.cwd(), '.env');
  let envFromFile = {};
  
  if (existsSync(envFilePath)) {
    try {
      const envFileContent = readFileSync(envFilePath, 'utf-8');
      envFileContent.split('\n').forEach(line => {
        const trimmedLine = line.trim();
        // Пропускаем комментарии и пустые строки
        if (trimmedLine && !trimmedLine.startsWith('#')) {
          const [key, ...valueParts] = trimmedLine.split('=');
          if (key && valueParts.length > 0) {
            const value = valueParts.join('=').trim();
            // Убираем кавычки если есть
            envFromFile[key.trim()] = value.replace(/^["']|["']$/g, '');
          }
        }
      });
    } catch (error) {
      console.warn('⚠️  Не удалось прочитать .env файл:', error.message);
    }
  }
  
  // Объединяем переменные: сначала из .env файла, потом из process.env (командная строка имеет приоритет)
  const env = {
    ...envFromFile,
    ...viteEnv,
    // Переменные из process.env (командная строка) имеют приоритет, но только если они установлены
    ...(process.env.CLIENT_HOST && { CLIENT_HOST: process.env.CLIENT_HOST }),
    ...(process.env.VITE_API_HOST && { VITE_API_HOST: process.env.VITE_API_HOST })
  };
  
  // Определяем HOST из переменных окружения
  // Поддерживаем CLIENT_HOST (удобная переменная) и VITE_API_HOST (стандартная Vite переменная)
  // Приоритет: CLIENT_HOST из командной строки > VITE_API_HOST из командной строки > CLIENT_HOST из .env > VITE_API_HOST из .env > localhost
  const HOST = env.CLIENT_HOST || env.VITE_API_HOST || 'localhost';
  const BASE = `http://${HOST}:3001`;
  const WS_BASE = `ws://${HOST}:3001`;
  
  // Логирование для отладки (можно убрать после проверки)
  console.log('🔧 Vite config - API Host:', HOST);
  console.log('🔧 Environment variables:', {
    'CLIENT_HOST (from .env)': envFromFile.CLIENT_HOST || 'not set',
    'CLIENT_HOST (from process.env)': process.env.CLIENT_HOST || 'not set',
    'CLIENT_HOST (final)': env.CLIENT_HOST || 'not set',
    'VITE_API_HOST (from .env)': envFromFile.VITE_API_HOST || 'not set',
    'VITE_API_HOST (from process.env)': process.env.VITE_API_HOST || 'not set',
    'VITE_API_HOST (final)': env.VITE_API_HOST || 'not set',
    finalHOST: HOST
  });

  return {
    plugins: [react()],
    // Определяем переменную окружения для использования в коде клиента
    // Это позволяет использовать CLIENT_HOST, который будет доступен как VITE_API_HOST
    define: {
      'import.meta.env.VITE_API_HOST': JSON.stringify(HOST)
    },
    server: {
      host: true,
      port: 5173,
      proxy: {
        '/api': {
          target: BASE,
          changeOrigin: true
        },
        '/ws': {
          target: WS_BASE,
          ws: true,
          changeOrigin: true
        }
      }
    }
  }
})
