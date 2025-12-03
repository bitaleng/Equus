import { createServer } from 'vite';

async function startServer() {
  const server = await createServer({
    server: {
      host: '0.0.0.0',
      port: 5000,
      allowedHosts: true,
    },
  });

  await server.listen();
  server.printUrls();
}

startServer().catch(console.error);
