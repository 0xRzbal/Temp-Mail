require('dotenv').config();
const { initDatabase } = require('./db');
const logger = require('./logger');
logger.info('Initializing database...');
initDatabase();
logger.info('Database initialized successfully!');
