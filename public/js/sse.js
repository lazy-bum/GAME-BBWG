export function createJsonEventSource(path, { onMessage, onDisconnect }) {
  let source = new EventSource(path);

  source.onmessage = (event) => {
    try {
      onMessage(JSON.parse(event.data));
    } catch {
      // ignore malformed event payloads
    }
  };

  source.onerror = () => {
    close();
    onDisconnect?.();
  };

  function close() {
    if (source) {
      source.close();
      source = null;
    }
  }

  return {
    close,
    isOpen() {
      return Boolean(source);
    }
  };
}
