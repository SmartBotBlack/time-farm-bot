import { z } from "zod";
import dotenv from "dotenv";
dotenv.config({ path: [".env.local", ".env"] });

const envSchema = z.object({
	APP_ID: z.coerce.number(),
	API_HASH: z.string(),
	DEVICE_MODEL: z.string().default("Monomy Crypto Farmer"),
});

const env = envSchema.parse(process.env);

export default env;
