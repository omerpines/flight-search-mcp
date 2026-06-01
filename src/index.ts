import 'dotenv/config';

async function main() {
  const mode = process.env.MCP_MODE ?? 'http';

  if (mode === 'stdio') {
    // Stdio transport — Claude Code spawns the process directly
    const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
    const { FlightSearchMCPServer } = await import('./server.js');

    const mcpServer = new FlightSearchMCPServer();
    const transport = new StdioServerTransport();
    await mcpServer.connect(transport);

    // Keep process alive until transport closes
    process.on('SIGTERM', () => process.exit(0));
    process.on('SIGINT', () => process.exit(0));
  } else {
    // HTTP server mode
    const { FlightSearchHTTPServer } = await import('./server.js');

    const server = new FlightSearchHTTPServer();
    server.start();

    process.on('SIGTERM', () => {
      console.log('\n[Signal] SIGTERM received — shutting down gracefully');
      process.exit(0);
    });

    process.on('SIGINT', () => {
      console.log('\n[Signal] SIGINT received — shutting down gracefully');
      process.exit(0);
    });
  }
}

main().catch((err) => {
  console.error('[Fatal]', err);
  process.exit(1);
});
