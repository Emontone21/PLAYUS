// Imprime las claves anon y service_role firmadas con el JWT_SECRET del
// mini-supabase, para pegarlas en .env.local.
import jwt from "jsonwebtoken";
import webpush from "web-push";
import crypto from "node:crypto";

const secret = process.env.JWT_SECRET ?? "super-secret-jwt-token-with-at-least-32-characters-long";
const iat = 1700000000;
const exp = 2000000000;
const anon = jwt.sign({ iss: "supabase", role: "anon", iat, exp }, secret);
const service = jwt.sign({ iss: "supabase", role: "service_role", iat, exp }, secret);
console.log(`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:${process.env.PORT ?? 54321}`);
console.log(`NEXT_PUBLIC_SUPABASE_ANON_KEY=${anon}`);
console.log(`SUPABASE_SERVICE_ROLE_KEY=${service}`);
// el emulador no tiene Realtime: el ranking en vivo usa el refresco periódico
console.log("NEXT_PUBLIC_DISABLE_REALTIME=1");
// Web Push: claves VAPID nuevas (las suscripciones viejas dejan de valer) y secreto del cron
const vapid = webpush.generateVAPIDKeys();
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${vapid.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${vapid.privateKey}`);
console.log("VAPID_SUBJECT=mailto:dev@playus.local");
console.log(`CRON_SECRET=${crypto.randomBytes(24).toString("base64url")}`);
