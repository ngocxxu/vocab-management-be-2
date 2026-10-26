import appConfig from './app.config';
import auth0Config from './auth0.config';
import databaseConfig from './database.config';
import firebaseConfig from './firebase.config';
import jwtConfig from './jwt.config';
import mailConfig from './mail.config';
import mcpConfig from './mcp.config';
import qdrantConfig from './qdrant.config';
import redisConfig from './redis.config';
import supabaseConfig from './supabase.config';

export { validationSchema } from './validation.schema';

export const envConfigLoaders = [appConfig, databaseConfig, redisConfig, firebaseConfig, supabaseConfig, jwtConfig, auth0Config, mailConfig, qdrantConfig, mcpConfig];

export { appConfig, auth0Config, databaseConfig, firebaseConfig, jwtConfig, mailConfig, mcpConfig, qdrantConfig, redisConfig, supabaseConfig };
