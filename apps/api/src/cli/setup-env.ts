import { projectRoot as findProjectRoot } from '../paths.js';
import { fileURLToPath } from 'node:url';
import { initializeEnv } from '../core/setup.js';
console.log(initializeEnv(findProjectRoot(import.meta.url)).message);
