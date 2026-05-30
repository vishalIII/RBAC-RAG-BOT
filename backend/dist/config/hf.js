import { HfInference } from "@huggingface/inference";
import dotenv from "dotenv";
dotenv.config();
export const hf = new HfInference(process.env.HUGGINGFACEHUB_API_TOKEN);
