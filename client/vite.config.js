import {defineConfig, loadEnv} from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({mode}) => {
  // Загружаем переменные окружения (включая без префикса VITE_)
  // Но переменные из process.env (командная строка) имеют приоритет над .env файлом
  const env = {
    ...loadEnv(mode, process.cwd(), ''),
    // Переменные из process.env (командная строка) имеют приоритет
    CLIENT_HOST: process.env.CLIENT_HOST,
    VITE_API_HOST: process.env.VITE_API_HOST
  };
  
  // Определяем HOST из переменных окружения
  // Поддерживаем CLIENT_HOST (удобная переменная) и VITE_API_HOST (стандартная Vite переменная)
  // Приоритет: CLIENT_HOST из командной строки > VITE_API_HOST из командной строки > значения из .env > localhost
  const HOST = env.CLIENT_HOST || env.VITE_API_HOST || 'localhost';
  const BASE = `http://${HOST}:3001`;
  const WS_BASE = `ws://${HOST}:3001`;
  
  // Логирование для отладки (можно убрать после проверки)
  console.log('🔧 Vite config - API Host:', HOST);
  console.log('🔧 Environment variables:', {
    CLIENT_HOST: env.CLIENT_HOST || 'not set',
    VITE_API_HOST: env.VITE_API_HOST || 'not set',
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
