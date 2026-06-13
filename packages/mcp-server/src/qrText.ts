export interface BuildQrTextOptions {
  serviceName: string;
  password: string;
}

export function buildQrText(opts: BuildQrTextOptions): string {
  if (!opts.serviceName) throw new Error("serviceName must be non-empty");
  if (!opts.password) throw new Error("password must be non-empty");
  return `WIFI:T:ADB;S:${opts.serviceName};P:${opts.password};;`;
}
