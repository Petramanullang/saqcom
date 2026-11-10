/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    ip: string;
    isAdmin: boolean;
    pc: number;
    settings: import('./lib/settings').Settings;
  }
}
