export type Address = { host: string; port: number };

export function addressKey(address: Address): string {
  return `${address.host}:${address.port}`;
}

export interface Datagram {
  from: Address;
  to: Address;
  payload: Uint8Array;
}

export interface DatagramTransport {
  readonly kind: string;
  readonly localAddress: Address | null;
  open(): Promise<void>;
  send(to: Address, payload: Uint8Array): Promise<void>;
  close(): Promise<void>;
  onReceive(handler: (datagram: Datagram) => void): void;
}

export class DatagramSocket {
  #transport: DatagramTransport;
  #handlers: ((datagram: Datagram) => void)[] = [];
  #closed = false;

  constructor(transport: DatagramTransport) {
    this.#transport = transport;
    transport.onReceive((datagram) => {
      if (this.#closed) return;
      for (const handler of this.#handlers) handler(datagram);
    });
  }

  get transport(): DatagramTransport {
    return this.#transport;
  }

  get localAddress(): Address | null {
    return this.#transport.localAddress;
  }

  async open(): Promise<void> {
    await this.#transport.open();
  }

  async send(to: Address, payload: Uint8Array): Promise<void> {
    if (this.#closed) return;
    await this.#transport.send(to, payload);
  }

  onDatagram(handler: (datagram: Datagram) => void): void {
    this.#handlers.push(handler);
  }

  async close(): Promise<void> {
    this.#closed = true;
    this.#handlers = [];
    await this.#transport.close();
  }
}
