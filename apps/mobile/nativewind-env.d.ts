/// <reference types="nativewind/types" />

declare module '*.css';

declare module '*.png' {
  const value: number;
  export default value;
}