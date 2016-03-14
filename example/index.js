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
});

if (require.main === module) {
  var port = process.env.PORT || 3000
  console.log(`\n  Running on: http://localhost:${port}`);
  app.listen(port);
}
