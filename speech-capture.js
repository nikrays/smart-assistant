class SpeechCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.samples = new Float32Array(16000);
    this.offset = 0;
  }
  process(inputs) {
    const input = inputs[0]?.[0];
    if (input) {
      for (const sample of input) {
        this.samples[this.offset++] = sample;
        if (this.offset === this.samples.length) {
          this.port.postMessage(this.samples, [this.samples.buffer]);
          this.samples = new Float32Array(16000);
          this.offset = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('speech-capture', SpeechCapture);
