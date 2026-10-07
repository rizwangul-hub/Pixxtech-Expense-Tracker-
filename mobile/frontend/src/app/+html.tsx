import { PropsWithChildren } from 'react';
import { ScrollViewStyleReset } from 'expo-router/html';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Pak Expense Tracker</title>
        <meta name="application-name" content="Pak Expense Tracker" />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
