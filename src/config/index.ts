import appConfig from './app.config';
import databaseConfig from './database.config';
import firebaseConfig from './firebase.config';
import jwtConfig from './jwt.config';
import mailConfig from './mail.config';
import qdrantConfig from './qdrant.config';
import redisConfig from './redis.config';
import supabaseConfig from './supabase.config';

export { validationSchema } from './validation.schema';

export const envConfigLoaders = [appConfig, databaseConfig, redisConfig, firebaseConfig, supabaseConfig, jwtConfig, mailConfig, qdrantConfig];

export { appConfig, databaseConfig, firebaseConfig, jwtConfig, mailConfig, qdrantConfig, redisConfig, supabaseConfig };
