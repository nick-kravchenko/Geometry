// Rebuilds the wasm package (dev profile) whenever Rust sources change.
import { watch } from 'node:fs';
import { spawn } from 'node:child_process';

let timer;
let running = false;
let pending = false;

function build() {
  if (running) {
    pending = true;
    return;
  }
  running = true;
  const child = spawn('wasm-pack', ['build', '--dev', '--target', 'bundler'], { stdio: 'inherit' });
  child.on('exit', () => {
    running = false;
    if (pending) {
      pending = false;
      build();
    }
  });
}

for (const path of ['src', 'Cargo.toml']) {
  watch(path, { recursive: true }, (_event, file) => {
    if (file && (file.endsWith('.rs') || file.endsWith('Cargo.toml'))) {
      clearTimeout(timer);
      timer = setTimeout(build, 200);
    }
  });
}
console.log('watching Rust sources for changes');
