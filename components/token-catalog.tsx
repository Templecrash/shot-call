"use client";
import { createContext, useContext } from "react";
import { TOKENS, type Token } from "@/lib/data";
export const TokenCatalogContext = createContext<Record<string, Token>>(TOKENS);
export const useTokenCatalog = () => useContext(TokenCatalogContext);
