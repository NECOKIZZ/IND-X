// Entry point: the crypto/Buffer polyfills must load before any route (expo-router
// loads every route up front, and Solana's libraries read crypto as they load).
import "./src/lib/polyfills";
import "expo-router/entry";
