// Seed sample steps on all interface flow diagrams
// Run: node scripts/seed-steps.mjs

const BASE = process.env.BASE ?? 'http://localhost:3000/api/interfaces'
const STEP_ROW_H = 26
const endpointW = 160
const platformW = 160
const sysH      = 80
const gap       = 80

// ── Sample step copy pools ────────────────────────────────────────────────────

const SENDER_STEPS = [
  { text: 'Extract delta',    notes: 'Reads delta records from the source system using Change Pointers or event triggers.' },
  { text: 'Build payload',    notes: 'Serialises selected fields into the outbound message format (IDoc / XML / JSON).' },
]
const VIA_STEPS = [
  { text: 'Route & map',      notes: 'Applies content-based routing and executes XSLT / Groovy mapping to target format.' },
  { text: 'Enrich & validate',notes: 'Performs value-mapping lookups and schema validation before forwarding.' },
]
const RECV_STEPS = [
  { text: 'Load to target',   notes: 'Writes the transformed payload to the receiver system via the configured adapter.' },
  { text: 'Send ACK',         notes: 'Returns an asynchronous acknowledgement to the integration middleware.' },
]
const HOP_STEPS = [
  { text: 'Stage & forward',  notes: 'Buffers the message and forwards to the next hop after protocol translation.' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

let seq = 100
const uid = () => `seed${seq++}`

function stepsForRole(role, startNum) {
  const pool =
    role === 'sender' ? SENDER_STEPS :
    role === 'via'    ? VIA_STEPS    :
    role === 'recv'   ? RECV_STEPS   :
                        HOP_STEPS
  return pool.map((s, i) => ({ id: uid(), num: startNum + i, text: s.text, notes: s.notes }))
}

function nodeHeight(base, steps) {
  return Math.max(base, base + steps.length * STEP_ROW_H + 10)
}

// Simplified layout generator (mirrors buildInterfaceState logic)
function buildState(iface, sysMap) {
  const nodes = []
  const edges = []
  let x = 60, topY = 40
  let stepNum = 1

  const makeNode = (label, nx, ny, w, key, role) => {
    const steps = stepsForRole(role, stepNum)
    stepNum += steps.length
    return { id: uid(), type: 'system', label, x: nx, y: ny,
      width: w, height: nodeHeight(sysH, steps),
      color: '#1565C0', fontSize: 13, nodeKey: key, steps }
  }

  const rc = n => ({ x: n.x + n.width, y: n.y + n.height / 2 })
  const lc = n => ({ x: n.x,           y: n.y + n.height / 2 })
  const edge = (a, b) => ({
    id: uid(), fromNodeId: a.id, toNodeId: b.id,
    path: [rc(a), lc(b)], label: '', arrow: 'end',
  })

  // Sender
  const senderLabel = sysMap.get(iface.sender_system_id) ?? 'Sender'
  const sender = makeNode(senderLabel, x, topY, endpointW, 'sender', 'sender')
  nodes.push(sender)
  x += endpointW + gap

  // Shared via hops
  let prevNode = sender
  for (let vi = 0; vi < iface.via.length; vi++) {
    const hop = iface.via[vi]
    const label = (hop.system_id && sysMap.get(hop.system_id)) ?? hop.label
    const n = makeNode(label, x, topY, platformW, `via-${vi}`, 'via')
    nodes.push(n)
    edges.push(edge(prevNode, n))
    prevNode = n
    x += platformW + gap
  }

  // Receivers
  let recvY = topY
  for (let ri = 0; ri < iface.receivers.length; ri++) {
    const recv = iface.receivers[ri]
    let branchNode = prevNode, branchX = x

    for (let hi = 0; hi < recv.via.length; hi++) {
      const hop = recv.via[hi]
      const label = (hop.system_id && sysMap.get(hop.system_id)) ?? hop.label
      const n = makeNode(label, branchX, recvY, platformW, `recv-${ri}-via-${hi}`, 'hop')
      nodes.push(n)
      edges.push(edge(branchNode, n))
      branchNode = n
      branchX += platformW + gap
    }

    const recvLabel = (recv.system_id && sysMap.get(recv.system_id)) ?? 'Receiver'
    const recvNode = makeNode(recvLabel, branchX, recvY, endpointW, `recv-${ri}`, 'recv')
    nodes.push(recvNode)
    edges.push(edge(branchNode, recvNode))
    recvY += sysH + gap
  }

  return { nodes, edges }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const [interfaces, systems] = await Promise.all([
    fetch(`${BASE}/interfaces`).then(r => r.json()),
    fetch(`${BASE}/systems`).then(r => r.json()),
  ])

  const sysMap = new Map(systems.map(s => [s.id, s.name]))

  let done = 0, skipped = 0
  for (const iface of interfaces) {
    if (!iface.sender_system_id) { skipped++; continue }

    // Always generate a fresh layout from scratch — ensures correct nodeKeys
    // and proper role-based step assignment regardless of any previously saved state
    const state = buildState(iface, sysMap)

    await fetch(`${BASE}/interfaces/${iface.id}/flow-diagram`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    })

    console.log(`✓  ${iface.ref.padEnd(14)} ${iface.name}  (${state.nodes.filter(n => n.steps?.length).length} nodes with steps)`)
    done++
  }

  console.log(`\nDone: ${done} seeded, ${skipped} skipped (no sender).`)
}

main().catch(err => { console.error(err); process.exit(1) })
