import { Provider } from "ethers";
import { Statistics } from "./types";

function createRndHexStringLen12(): string {
  let result: string = Math.random().toString(16).substring(2, 14);
  if (result.length < 12) {
    return result.padStart(12, "0");
  }
  return result;
}

export function createRndHexString(length: number): string {
  const resultArr: string[] = [];
  for (let i = 0; i <= length; i += 12) {
    resultArr.push(createRndHexStringLen12());
  }
  return resultArr.join("").substring(0, length);
}

export async function createEoaAddress(provider: Provider): Promise<string> {
  let address: string;
  let code: string;
  do {
    address = "0x" + createRndHexString(40);
    code = await provider.getCode(address);
  } while (code != "0x");
  return address;
}

export async function wait(timeoutInMills: number) {
  await new Promise((resolve) => setTimeout(resolve, timeoutInMills));
}

export function waitSync(timeoutInMills: number) {
  const begTimestamp = Date.now();
  while (Date.now() - begTimestamp < timeoutInMills) {
    // do nothing
  }
}

export async function waitSuitableMilliseconds(targetMillisecondsString: string) {
  const coef: number = Math.pow(10, targetMillisecondsString.length);
  let millisecondsToWait = parseInt(targetMillisecondsString) - Date.now() % coef;
  if (millisecondsToWait < 0) {
    millisecondsToWait += coef;
  }
  if (millisecondsToWait > 0) {
    await wait(millisecondsToWait);
  }
}

export function collectStatistics(iterator: IterableIterator<any>, converter?: (value: any) => number): Statistics {
  let n = 0;
  let s1 = 0;
  let s2 = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const item of iterator) {
    const value: number = !converter ? item : converter(item);
    ++n;
    s1 += value;
    s2 += value * value;
    if (value > max) {
      max = value;
    }
    if (value < min) {
      min = value;
    }
  }
  if (n === 0) {
    return {
      min: 0,
      max: 0,
      avr: 0,
      std: 0,
    };
  } else {
    return {
      min,
      max,
      avr: s1 / n,
      std: (n < 2) ? 0 : Math.sqrt((n * s2 - s1 * s1) / (n * (n - 1))),
    };
  }
}

export function stringifyObjWithBigintToJson(obj: any): string {
  return JSON.stringify(obj, (key, value) => {
    return typeof value === "bigint"
      ? value.toString()
      : value;
  });
}