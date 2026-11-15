declare module "@echogarden/fvad-wasm" {
  type FvadModule = {
    HEAP16: Int16Array;
    _malloc(size: number): number;
    _free(pointer: number): void;
    _fvad_new(): number;
    _fvad_free(pointer: number): void;
    _fvad_set_mode(pointer: number, mode: number): number;
    _fvad_set_sample_rate(pointer: number, rate: number): number;
    _fvad_process(pointer: number, frame: number, length: number): number;
  };
  export default function initialize(): Promise<FvadModule>;
}
