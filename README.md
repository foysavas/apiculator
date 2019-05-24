# apiculator

Mock JSON API tool for Node, using:

* [`express`](http://expressjs.com/)
* [`babelon`](https://github.com/foysavas/babelon) templates to keep it brief.

### Directories specify routes; files specify methods

```
api
└── get.json
```

Will respond to any GET request to '/' with the JSON in the file.


### Header tags give the client control

```
api
└── session
    ├── post.json
    └── post+bad.json
```

Generally, if the client POSTs to '/session' then `post.json` is the response.

However, if the client POSTs to '/session' with the HTTP header `X-APICULATOR-TAGS: bad`, then the `post+bad.json` is the response.

### Babelon templates and helpers for terse JSON

```
api
└── users
    └── get.babelon
```

`> api/user/get.babelon`
```javascript
{
  ok: true,
  users: _.times(5, () => ({
    id: faker.random.number(),
    name: `${faker.name.firstName()} ${faker.name.lastName()}`
  }))
}
```

### Rules for when you need them

```
api
└── gatekeeper
    └── _rules.babelon
```

`> api/gatekeeper/_rules.babelon`
```javascript
[
  // correct password
  {
    request: {
      body: (body) => (body.password === 'secret')
    },
    response: {
      status: 302,
      redirect: '/users'
    }
  },
  // catches all other requests (wrong password)
  {
    response: {
      json: { ok: false }
    }
  }
]
```

### Raw Express route handlers

```
api
└── express
    └── get.js
```

`> api/express/get.js`
```javascript
  module.exports = function(req, res) {
    res.send(`express says hello ${req.query.name}`);
  }
```