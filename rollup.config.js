import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import { string } from 'rollup-plugin-string';

export default {
  input: 'src/index.ts',
  output: {
    file: 'dist/rosalind-leetcode-style.user.js',
    format: 'iife',
    banner: `// ==UserScript==
// @name         Rosalind LeetCode Style with Python REPL
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  Apply LeetCode-inspired styling to Rosalind problems page with interactive Python REPL
// @author       You
// @match        https://rosalind.info/problems/*
// @match        https://rosalind.info/problems
// @grant        none
// ==/UserScript==`
  },
  plugins: [
    string({
      include: ['**/*.css', '**/*.svg']
    }),
    nodeResolve(),
    typescript({
      tsconfig: './tsconfig.json',
      sourceMap: false,
      inlineSources: false
    })
  ]
};
