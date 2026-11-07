// npm run quest:check [-- --serial <serial>] [--dry-run]
// Lists the headset (adb), its model and battery, the active `adb reverse` rules and the state of the dev server.
// Ends with a clear message and exit code 1 when there is no adb or no usable device.

import { adbCommand, formatCommand, parseBattery, parseReverseList } from './lib.mjs';
import { args, fail, firstLine, readServerStatus, resolveSerial, run, showDry } from './runtime.mjs';

const USAGE = 'usage: npm run quest:check -- [--serial <serial>] [--dry-run]';
const { options, flags } = args(process.argv.slice(2), { options: ['serial'] }, USAGE);

if (flags['dry-run']) {
  const serial = options.serial ?? null;
  showDry(adbCommand(null, 'devices', '-l'));
  showDry(adbCommand(serial, 'reverse', '--list'));
  showDry(adbCommand(serial, 'shell', 'getprop', 'ro.product.model'));
  showDry(adbCommand(serial, 'shell', 'dumpsys', 'battery'));
  showDry({ program: 'npx', args: ['@iwsdk/cli', 'dev', 'status'] });
  process.exit(0);
}

const serial = resolveSerial(options.serial, false);
const model = run(adbCommand(serial, 'shell', 'getprop', 'ro.product.model'));
const battery = run(adbCommand(serial, 'shell', 'dumpsys', 'battery'));
const reverse = run(adbCommand(serial, 'reverse', '--list'));
const level = battery.ok ? parseBattery(battery.stdout) : null;
console.log(`device:  ${serial}`);
console.log(`model:   ${model.ok ? firstLine(model.stdout) || 'n/a' : 'n/a'}`);
console.log(`battery: ${level === null ? 'n/a' : level + '%'}`);
const rules = reverse.ok ? parseReverseList(reverse.stdout) : [];
console.log(rules.length > 0 ? `reverse: ${rules.join('; ')}` : 'reverse: none (run `npm run quest:reverse`)');
const status = readServerStatus();
if (status.running) {
  console.log(`server:  running at ${status.local ?? status.network[0] ?? 'unknown address'}`);
} else {
  console.log('server:  not running (run `npm run quest:serve`)');
}
if (!model.ok && !battery.ok) fail(`adb could not talk to ${serial}: ${formatCommand(adbCommand(serial, 'shell', 'true'))} failed`);
