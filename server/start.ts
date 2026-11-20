import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { createHousingApi } from './api.ts'

if (process.env.NODE_ENV !== 'production') {
  try {
    process.loadEnvFile('.env.local')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}
const api = createHousingApi(process.env)
const dist = resolve('dist')
const mime: Record<string, string> = {
  '.js': 'text/javascript',
  '.html': 'text/html',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon'
}
const server = createServer(async (req, res) => {
  try {
    if (await api(req, res)) return
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end()
      return
    }
    const pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname)
    const shell =
      ['/', '/login', '/auth/callback', '/dashboard'].includes(pathname.replace(/\/$/, '') || '/') ||
      pathname.startsWith('/preferences/')
    const file = resolve(dist, shell ? 'index.html' : '.' + pathname)
    if (!file.startsWith(dist + sep) || !(await stat(file)).isFile()) {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, {
      'Content-Type': mime[extname(file)] || 'application/octet-stream',
      'Cache-Control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
      'X-Content-Type-Options': 'nosniff'
    })
    if (req.method === 'HEAD') res.end()
    else
      createReadStream(file)
        .on('error', () => res.destroy())
        .pipe(res)
  } catch {
    if (!res.headersSent) res.writeHead(404)
    res.end()
  }
})
server.listen(Number(process.env.PORT || 3000), () => {
  const address = server.address()
  if (address && typeof address === 'object') console.log('Housing server listening on port ' + address.port)
})
