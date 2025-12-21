
import { logger } from './lib/logger.js'; // Adjust path if needed or just use console
console.log('Is require.main === module?', require.main === module);
console.log('require.main:', require.main?.filename);
console.log('module.filename:', module.filename);
