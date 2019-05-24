module.exports = function(req, res) {
  res.send(`express says hello ${req.query.name}`);
};
