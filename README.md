# Use AI API

API endpoint:

```txt
/api/use-ai?q=hello
```

POST endpoint:

```js
fetch('/api/use-ai', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ q: 'hello' })
})
```
