import path from 'path';
import express, { type Request, type Response, type NextFunction } from 'express';
import { rateLimit } from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  InitializeRequestSchema,
  isInitializeRequest,
} from '@modelcontextprotocol/sdk/types.js';
import { SerpAPIClient } from './services/serpapi.js';
import { toolDefinitions, callTool } from './tools/index.js';

// ---- MCP server class ----

export class FlightSearchMCPServer {
  private server: Server;
  private serpapi: SerpAPIClient;

  constructor() {
    this.serpapi = new SerpAPIClient();
    this.server = new Server(
      { name: 'flight-search-mcp', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );
    this.registerHandlers();
  }

  private registerHandlers(): void {
    this.server.setRequestHandler(InitializeRequestSchema, async (req) => ({
      protocolVersion: req.params.protocolVersion,
      capabilities: { tools: {} },
      serverInfo: { name: 'flight-search-mcp', version: '1.0.0' },
      instructions:
        'Flight search MCP server. Use search_flights to find flights, get_best_deal for the optimal option, get_flight_details for confirmed pricing, and track_price to monitor prices over time.',
    }));

    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: toolDefinitions,
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (req) => {
      const { name, arguments: args } = req.params;
      try {
        return await callTool(name, (args ?? {}) as Record<string, unknown>, this.serpapi);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async connect(transport: any): Promise<void> {
    await this.server.connect(transport);
  }

  async close(): Promise<void> {
    await this.server.close();
  }
}

// ---- HTTP server class ----

export class FlightSearchHTTPServer {
  private app: express.Application;
  private serpapi = new SerpAPIClient(); // shared instance for REST API routes
  // Object.create(null) prevents prototype pollution via user-supplied session IDs
  private transports: Record<string, StreamableHTTPServerTransport | SSEServerTransport> =
    Object.create(null);

  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  // ---- middleware ----

  private setupMiddleware(): void {
    // Security headers
    this.app.use((_req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      if (process.env.NODE_ENV === 'production') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      }
      next();
    });

    // CORS
    this.app.use((_req, res, next) => {
      const origin = process.env.CORS_ORIGIN ?? '*';
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, Mcp-Session-Id, Accept, Last-Event-ID'
      );
      next();
    });

    // Serve the web frontend from public/
    this.app.use(express.static(path.join(__dirname, '../public')));

    // JSON body parser — NOT applied globally (StreamableHTTP needs raw stream)
    // Applied only on routes that need it via inline middleware
  }

  // ---- auth helper ----

  private checkAuth(req: Request, res: Response): boolean {
    const authToken = process.env.AUTH_TOKEN;
    if (!authToken) return true; // No auth configured — allow all (dev mode)

    const header = req.headers.authorization ?? '';
    if (!header.startsWith('Bearer ') || header.slice(7) !== authToken) {
      res.status(401).json({ error: 'Unauthorized. Provide a valid Bearer token.' });
      return false;
    }
    return true;
  }

  // ---- rate limiter for MCP endpoints ----

  private mcpRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
  });

  // ---- routes ----

  private setupRoutes(): void {
    // Health check (unauthenticated)
    this.app.get('/health', (_req, res) => {
      res.json({
        status: 'ok',
        service: 'flight-search-mcp',
        version: '1.0.0',
        uptime: Math.floor(process.uptime()),
        tools: toolDefinitions.map((t) => t.name),
      });
    });

    // Server info (unauthenticated)
    this.app.get('/', (_req, res) => {
      res.json({
        name: 'Flight Search MCP Server',
        version: '1.0.0',
        endpoints: {
          health: 'GET /health',
          mcp_streamable: 'POST /mcp (StreamableHTTP transport)',
          mcp_sse_stream: 'GET /mcp (SSE stream on existing session)',
          mcp_session_delete: 'DELETE /mcp (terminate session)',
          sse_legacy: 'GET /sse (legacy SSE transport)',
          messages_legacy: 'POST /messages?sessionId=... (legacy SSE messages)',
        },
        tools: toolDefinitions.map((t) => ({ name: t.name, description: t.description })),
      });
    });

    // OPTIONS preflight
    this.app.options('/mcp', (_req, res) => res.sendStatus(204));
    this.app.options('/sse', (_req, res) => res.sendStatus(204));
    this.app.options('/messages', (_req, res) => res.sendStatus(204));

    // ---- StreamableHTTP transport (/mcp) ----

    // POST /mcp — initialize or send message
    this.app.post(
      '/mcp',
      this.mcpRateLimit,
      express.json({ limit: '4mb' }),
      async (req: Request, res: Response) => {
        if (!this.checkAuth(req, res)) return;
        try {
          const sessionId = req.headers['mcp-session-id'] as string | undefined;

          if (sessionId && this.transports[sessionId]) {
            // Existing session
            const transport = this.transports[sessionId];
            if (transport instanceof StreamableHTTPServerTransport) {
              await transport.handleRequest(req, res, req.body);
            } else {
              res.status(400).json({ error: 'Session is on SSE transport, use /messages.' });
            }
            return;
          }

          // New session — must be an Initialize request
          if (!isInitializeRequest(req.body)) {
            res.status(400).json({
              error: 'First request must be an MCP Initialize request, or provide Mcp-Session-Id header for existing session.',
            });
            return;
          }

          const newSessionId = uuidv4();
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => newSessionId,
            onsessioninitialized: (id) => {
              this.transports[id] = transport;
              console.log(`[MCP] StreamableHTTP session initialized: ${id}`);
            },
          });

          transport.onclose = () => {
            delete this.transports[newSessionId];
            console.log(`[MCP] StreamableHTTP session closed: ${newSessionId}`);
          };

          const mcpServer = new FlightSearchMCPServer();
          await mcpServer.connect(transport);
          await transport.handleRequest(req, res, req.body);
        } catch (err) {
          console.error('[MCP] POST /mcp error:', err);
          if (!res.headersSent) {
            res.status(500).json({ error: 'Internal server error.' });
          }
        }
      }
    );

    // GET /mcp — SSE stream for server-to-client messages on existing StreamableHTTP session
    this.app.get('/mcp', async (req: Request, res: Response) => {
      if (!this.checkAuth(req, res)) return;
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      if (!sessionId || !this.transports[sessionId]) {
        res.status(400).json({ error: 'Missing or unknown Mcp-Session-Id.' });
        return;
      }

      const transport = this.transports[sessionId];
      if (!(transport instanceof StreamableHTTPServerTransport)) {
        res.status(400).json({ error: 'Session is on SSE transport, not StreamableHTTP.' });
        return;
      }

      try {
        await transport.handleRequest(req, res);
      } catch (err) {
        console.error('[MCP] GET /mcp error:', err);
        if (!res.headersSent) res.status(500).json({ error: 'Internal server error.' });
      }
    });

    // DELETE /mcp — terminate session
    this.app.delete('/mcp', async (req: Request, res: Response) => {
      if (!this.checkAuth(req, res)) return;
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      if (!sessionId || !this.transports[sessionId]) {
        res.status(404).json({ error: 'Session not found.' });
        return;
      }

      try {
        const transport = this.transports[sessionId];
        if (transport instanceof StreamableHTTPServerTransport) {
          await transport.handleRequest(req, res);
        } else {
          await transport.close();
          delete this.transports[sessionId];
          res.status(200).json({ success: true });
        }
      } catch (err) {
        console.error('[MCP] DELETE /mcp error:', err);
        if (!res.headersSent) res.status(500).json({ error: 'Internal server error.' });
      }
    });

    // ---- Legacy SSE transport (/sse + /messages) ----

    // GET /sse — create SSE session
    this.app.get('/sse', async (req: Request, res: Response) => {
      if (!this.checkAuth(req, res)) return;
      try {
        const sessionId = uuidv4();
        const transport = new SSEServerTransport('/messages', res);
        this.transports[sessionId] = transport;

        transport.onclose = () => {
          delete this.transports[sessionId];
          console.log(`[MCP] SSE session closed: ${sessionId}`);
        };

        const mcpServer = new FlightSearchMCPServer();
        await mcpServer.connect(transport);
        await transport.start();
        console.log(`[MCP] SSE session started: ${sessionId}`);
      } catch (err) {
        console.error('[MCP] GET /sse error:', err);
        if (!res.headersSent) res.status(500).json({ error: 'Internal server error.' });
      }
    });

    // POST /messages — deliver messages to SSE session
    this.app.post(
      '/messages',
      express.json({ limit: '4mb' }),
      async (req: Request, res: Response) => {
        if (!this.checkAuth(req, res)) return;
        const sessionId = req.query.sessionId as string | undefined;

        if (!sessionId || !this.transports[sessionId]) {
          res.status(404).json({ error: 'Session not found.' });
          return;
        }

        const transport = this.transports[sessionId];
        if (!(transport instanceof SSEServerTransport)) {
          res.status(400).json({ error: 'Session is not an SSE session.' });
          return;
        }

        try {
          await transport.handlePostMessage(req, res, req.body);
        } catch (err) {
          console.error('[MCP] POST /messages error:', err);
          if (!res.headersSent) res.status(500).json({ error: 'Internal server error.' });
        }
      }
    );

    // ---- REST API for web frontend (/api/*) ----
    // No MCP protocol — just JSON in, JSON out. No auth required (same host).

    const apiJson = express.json({ limit: '1mb' });

    const apiRoute =
      (toolName: string) => async (req: Request, res: Response): Promise<void> => {
        try {
          const result = await callTool(
            toolName,
            req.body as Record<string, unknown>,
            this.serpapi
          );
          const parsed = JSON.parse(result.content[0]?.text ?? '{}') as Record<string, unknown>;
          if (parsed['error']) {
            res.status(400).json(parsed);
          } else {
            res.json(parsed);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          res.status(500).json({ error: message });
        }
      };

    this.app.post('/api/search-flights', apiJson, apiRoute('search_flights'));
    this.app.post('/api/best-deal',       apiJson, apiRoute('get_best_deal'));
    this.app.post('/api/flight-details',  apiJson, apiRoute('get_flight_details'));
    this.app.post('/api/track',           apiJson, apiRoute('track_price'));

    // 404 fallback
    this.app.use((_req: Request, res: Response) => {
      res.status(404).json({ error: 'Not found.' });
    });

    // Global error handler
    this.app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
      console.error('[HTTP] Unhandled error:', err);
      res.status(500).json({ error: 'Internal server error.' });
    });
  }

  start(): void {
    const port = parseInt(process.env.PORT ?? '3001', 10);
    const host = process.env.HOST ?? '0.0.0.0';

    this.app.listen(port, host, () => {
      console.log(`\n🛫 Flight Search MCP Server running at http://${host}:${port}`);
      console.log(`   Health: http://localhost:${port}/health`);
      console.log(`   MCP:    http://localhost:${port}/mcp  (StreamableHTTP)`);
      console.log(`   SSE:    http://localhost:${port}/sse  (legacy)\n`);
      console.log(`   Tools: ${toolDefinitions.map((t) => t.name).join(', ')}\n`);

      if (!process.env.AUTH_TOKEN) {
        console.warn('   ⚠ AUTH_TOKEN not set — server is unauthenticated');
      }
      if (!process.env.SERPAPI_KEY) {
        console.warn('   ⚠ SERPAPI_KEY not set — flight searches will fail');
        console.warn('   Sign up at https://serpapi.com → get your API key (free tier: 100 searches/month)');
      }
    });
  }
}
