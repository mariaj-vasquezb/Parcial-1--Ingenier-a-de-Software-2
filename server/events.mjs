// Server-Sent Events: avisa a los clientes abiertos de cada usuario apenas cambia su billetera,
// para que el panel se actualice en menos de 2 segundos (SWR-003) sin esperar al siguiente sondeo.
const clients = new Map()

export function subscribe(userId, res) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
  res.write('retry: 2000\n\n')
  if (!clients.has(userId)) clients.set(userId, new Set())
  clients.get(userId).add(res)
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25_000)
  res.on('close', () => {
    clearInterval(heartbeat)
    clients.get(userId)?.delete(res)
    if (!clients.get(userId)?.size) clients.delete(userId)
  })
}

export function notify(...userIds) {
  const message = `event: wallet\ndata: ${JSON.stringify({ at: Date.now() })}\n\n`
  for (const userId of userIds) for (const res of clients.get(userId) ?? []) res.write(message)
}
