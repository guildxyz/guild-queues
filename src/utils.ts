export const stringify = (value: any): string => {
  if (Array.isArray(value) && typeof value[0] === "number") {
    return value.join(",");
  }

  switch (typeof value) {
    case "string":
      return value;
    case "object":
      return JSON.stringify(value);
    case "number":
    case "bigint":
    case "boolean":
    default:
      return value.toString();
  }
};

type KeyType = "number" | "number[]" | "boolean" | "string" | "object";
const keyTypeMap = new Map<string, KeyType>([
  ["userId", "number"],
  ["roleIds", "number[]"],
  ["priority", "number"],
  ["recheckAccess", "boolean"],
  ["updateMemberships", "boolean"],
  ["manageRewards", "boolean"],
  ["forceRewardActions", "boolean"],
  ["onlyForThisPlatform", "string"],
]);

export const parse = (keyName: string, value: string) => {
  const typeOfKey = keyTypeMap.get(keyName);
  switch (typeOfKey) {
    case "number":
      return +value;
    case "number[]":
      return value.split(",").map((x) => +x);
    case "boolean":
      return value === "true";
    case "object":
      return JSON.parse(value);
    case "string":
    default:
      return value;
  }
};
