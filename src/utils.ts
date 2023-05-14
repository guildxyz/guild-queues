import stringify from "fast-json-stable-stringify";
import objectHash, { NotUndefined } from "object-hash";

export const serialize = <T = any>(item: T): string => stringify(item);

export const deserialize = <T = any>(str: string): T => JSON.parse(str);

export const hash = <T = any>(item: T) => objectHash(item as NotUndefined);
