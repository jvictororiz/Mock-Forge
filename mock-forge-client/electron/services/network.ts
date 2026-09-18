import { networkInterfaces } from 'os';

export function getLocalIpAddress(): string | null {
  const nets = networkInterfaces();

  for (const interfaces of Object.values(nets)) {
    if (!interfaces) continue;
    for (const net of interfaces) {
      const isIPv4 = String(net.family) === 'IPv4';
      if (isIPv4 && !net.internal) {
        return net.address;
      }
    }
  }

  return null;
}
