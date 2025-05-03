export enum EOpCode {
  EOF = 0xff,
  SELECTDB = 0xfe,
  EXPIRE_TIME_SEC = 0xfd,
  EXPIRE_TIME_MS = 0xfc,
  RESIZE_DB = 0xfb,
  AUX = 0xfa,
}
