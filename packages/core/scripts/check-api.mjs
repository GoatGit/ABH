import { resolve } from 'node:path';
import { checkPackageApi } from '../../../scripts/check-package-api.mjs';
await checkPackageApi(resolve(import.meta.dirname, '..'));
