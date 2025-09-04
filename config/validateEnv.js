// config/validateEnv.js
import dotenv from "dotenv";
import { cleanEnv, str, url,num, makeValidator } from 'envalid';

dotenv.config();

const mongoUri = makeValidator(x => {
  if (!/^mongodb(\+srv)?:\/\//.test(x)) throw new Error('Invalid Mongo URI');
  return x;
});

export const env = cleanEnv(process.env, {
  NODE_ENV: str({ choices: ['development', 'production', 'test'] }),
  PORT:            num({ default: 4001 }),
  FRONTEND_URL:    url(),

  MONGO_URI:       mongoUri(),

  JWT_SECRET:        str(),
  JWT_REFRESH_SECRET: str(), // add this

  EMAIL_USER:      str(),
  EMAIL_PASS:      str(),

  SUPABASE_URL:            url(),
  SUPABASE_KEY:            str(),
  SUPABASE_BUCKET:         str(),
  SUPABASE_SERVICE_ROLE_KEY: str(),

  TWILIO_ACCOUNT_SID: str(),
  TWILIO_AUTH_TOKEN:  str(),
  TWILIO_SERVICE_SID: str(),
  TWILIO_PHONE:       str(),
});
