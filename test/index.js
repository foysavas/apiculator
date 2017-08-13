var assert = require('assert');
var articulator = require(`${__dirname}/../index.js`);
var faker = require('faker');
var lodash = require('lodash');
var app = articulator.createServer(`${__dirname}/../example/api`, {
  faker,
  _: lodash,
  random_posts: function(num) {
    return lodash.times(num, () => ({
      id: faker.random.number(),
      title: faker.lorem.sentence()
    }));
  }
}, function(res){
  return { full_url: `http://example.local${res.url}` };
});
var request = require('supertest').agent(app.listen());

describe('MATCH .../${method}.json', function() {
  describe('GET /', function() {
    it('should return ok', function(done) {
      request.get('/?_=123')
      .expect(200)
      .expect({
        "ok": true
      })
      .end(function(err,res) {
        if (err) return done(err);
        done();
      });
    });
  });
});

describe('MATCH .../${method}.babelon', function() {
  describe('GET /users', function() {
    it('should return ok', function(done) {
      request.get('/users')
      .expect(200)
      .expect(function(res){
        assert.equal(res.body.ok,true);
        assert.equal(res.body.users.length,5);
        assert.notEqual(res.body.users[0].id,null);
        assert.notEqual(res.body.users[0].name,null);
      })
      .end(function(err,res) {
        if (err) return done(err);
        done();
      });
    });
  });

  describe('GET /hello', function(){
    it('should say hello', function(done) {
      request.get('/hello?name=everyone')
      .expect(200)
      .expect(function(res){
        assert.equal(res.body.ok,true);
        assert.equal(res.body.answer,'hello everyone!');
      })
      .end(function(err,res) {
        if (err) return done(err);
        done();
      });
    });
  });
});

describe('MATCH .../${method}+${tag}.babelon', function() {
  describe('POST /users/:id', function() {
    it('should be okay', function(done) {
      request.get('/users/100')
      .expect(200)
      .expect(function(res){
        assert.equal(res.body.ok,true);
        assert.equal(res.body.user.posts.length,5);
        assert.notEqual(res.body.user.posts[0].title,null);
      })
      .end(function(err,res) {
        if (err) return done(err);
        done();
      });
    });

    it('should being missing given missing tag', function(done) {
      request.get('/users/100')
      .set('X-APICULATOR-TAGS','missing')
      .expect(200)
      .expect(function(res){
        assert.equal(res.body.ok,false);
      })
      .end(function(err,res) {
        if (err) return done(err);
        done();
      });
    });
  });
});

describe('MATCH .../_rules.babelon', function() {
  describe('/gatekeeper example', function() {
    describe('POST /gatekeeper', function() {
      it('should not ok bad passwords', function(done) {
        request.post('/gatekeeper')
        .send({password: 'please'})
        .expect(200)
        .expect({
          "ok": false
        })
        .end(function(err,res) {
          if (err) return done(err);
          done();
        });
      });

      it('should not ok good passwords', function(done) {
        request.post('/gatekeeper')
        .send({password: 'secret'})
        .expect(302)
        .expect('Location', '/users')
        .end(function(err,res) {
          if (err) return done(err);
          done();
        });
      });

      it('should handle multipart encoding', function(done) {
        request.post('/gatekeeper')
        .field('password', 'please')
        .expect(200)
        .expect({
          "ok": false
        })
        .end(function(err, res) {
          if (err) return done(err);
          done();
        });
      });
    });
  });

  describe('/session example', function() {
    it('should render named template', function(done) {
      request.post('/session')
      .send({what: 'ever'})
      .expect(200)
      .expect(function(res) {
        assert.notEqual(res.body.user.id,null);
      })
      .end(function(err,res) {
        if (err) return done(err);
        done();
      });
    });

    it('should be logged in', function(done) {
      request.post('/session')
      .send({what: 'ever'})
      .expect(200)
      .expect(function(res) {
        assert.notEqual(res.body.user.id,null);
      })
      .end(function(err,res) {
        if (err) return done(err);
        // session check
        request.get('/session')
        .expect(200)
        .expect(function(res) {
          assert.equal(res.body.ok,true);
          assert.notEqual(res.body.user.id,null);
        })
        .end(function(err,res) {
          if (err) return done(err);
          done();
        });
      });
    });

    it('should not be logged in', function(done) {
      request.post('/session')
      .set('X-APICULATOR-TAGS','bad')
      .send({what: 'ever'})
      .expect(200)
      .expect(function(res) {
        assert.equal(res.body.ok,false);
      })
      .end(function(err,res) {
        if (err) return done(err);
        // session check
        if (err) return done(err);
        request.get('/session')
        .expect(200)
        .expect(function(res) {
          assert.equal(res.body.ok,false);
        })
        .end(function(err,res) {
          if (err) return done(err);
          done();
        });
      });
    });
  });
});

describe('Dynamic Helpers', function() {
  describe('GET /dynamics', function() {
    it('should return ok', function(done) {
      request.get('/dynamics')
      .expect(200)
      .expect({
        "ok": true,
        "full_url": "http://example.local/dynamics"
      })
      .end(function(err,res) {
        if (err) return done(err);
        done();
      });
    });
  });
});
