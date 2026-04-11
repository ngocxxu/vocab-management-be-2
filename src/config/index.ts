import appConfig from './app.config';
import databaseConfig from './database.config';
import firebaseConfig from './firebase.config';
import jwtConfig from './jwt.config';
import mailConfig from './mail.config';
import redisConfig from './redis.config';
import supabaseConfig from './supabase.config';

export { validationSchema } from './validation.schema';

export const envConfigLoaders = [
    appConfig,
    databaseConfig,
    redisConfig,
    firebaseConfig,
    supabaseConfig,
    jwtConfig,
    mailConfig,
];

export {
    appConfig,
    databaseConfig,
    firebaseConfig,
    jwtConfig,
    mailConfig,
    redisConfig,
    supabaseConfig,
};
