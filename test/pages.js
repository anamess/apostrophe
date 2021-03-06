var t = require('../test-lib/test.js');
var assert = require('assert');
var _ = require('lodash');
var async = require('async');
var request = require('request');

var apos;

describe('Pages', function() {

  this.timeout(5000);

  after(function(done) {
    return t.destroy(apos, done);
  });

  //////
  // EXISTENCE
  //////

  it('should be a property of the apos object', function(done) {
    apos = require('../index.js')({
      root: module,
      shortName: 'test',
      
      modules: {
        'apostrophe-express': {
          secret: 'xxx',
          port: 7900
        },
        'apostrophe-pages': {
          park: [],
          types: [
            {
              name: 'home',
              label: 'Home'
            },
            {
              name: 'testPage',
              label: 'Test Page'
            }
          ]
        }
      },
      afterInit: function(callback) {
        assert(apos.pages);
        apos.argv._ = [];
        return callback(null);
      },
      afterListen: function(err) {
        done();
      }
    });
  });


  //////
  // SETUP
  //////

  it('should make sure all of the expected indexes are configured', function(done){
    var expectedIndexes = ['path'];
    var actualIndexes = []

    apos.docs.db.indexInformation(function(err, info){
      assert(!err);

      // Extract the actual index info we care about
      _.each(info, function(index){
        actualIndexes.push(index[0][0]);
      });

      // Now make sure everything in expectedIndexes is in actualIndexes
      _.each(expectedIndexes, function(index){
        assert(_.contains(actualIndexes, index))
      });

      done();
    });
  });

  it('parked homepage exists', function(done) {
    return apos.pages.find(apos.tasks.getAnonReq(), { level: 0 }).toObject(function(err, home) {
      assert(!err);
      assert(home);
      assert(home.slug === '/');
      assert(home.path === '/');
      assert(home.type === 'home');
      assert(home.parked);
      assert(home.published);
      done();
    });
  });

  it('parked trash can exists', function(done) {
    return apos.pages.find(apos.tasks.getReq(), { slug: '/trash' }).published(null).trash(null).toObject(function(err, trash) {
      assert(!err);
      assert(trash);
      assert(trash.slug === '/trash');
      assert(trash.path === '/trash');
      assert(trash.type === 'trash');
      assert(trash.parked);
      assert(!trash.published);
      // Verify that clonePermanent did its
      // job and removed properties not meant
      // to be stored in mongodb
      assert(!trash._children);
      done();
    });
  });

  it('should be able to use db to insert documents', function(done){
    var testItems = [
      { _id: '1234',
        type: 'testPage',
        slug: '/parent',
        published: true,
        path: '/parent',
        level: 1,
        rank: 0
      },
      {
        _id: '2341',
        type: 'testPage',
        slug: '/child',
        published: true,
        path: '/parent/child',
        level: 2,
        rank: 0
      },
      {
        _id: '4123',
        type: 'testPage',
        slug: '/grandchild',
        published: true,
        path: '/parent/child/grandchild',
        level: 3,
        rank: 0
      },
      {
        _id: '4321',
        type: 'testPage',
        slug: '/sibling',
        published: true,
        path: '/parent/sibling',
        level: 2,
        rank: 1

      },
      {
        _id: '4312',
        type: 'testPage',
        slug: '/cousin',
        published: true,
        path: '/parent/sibling/cousin',
        level: 3,
        rank: 0
      },
      {
        _id: '4333',
        type: 'testPage',
        slug: '/another-parent',
        published: true,
        path: '/another-parent',
        level: 1,
        rank: 0
      }
    ];

    apos.docs.db.insert(testItems, function(err){
      assert(!err);
      done();
    });

  });


  //////
  // FINDING
  //////

  it('should have a find method on pages that returns a cursor', function(){
    var cursor = apos.pages.find(apos.tasks.getAnonReq());
    assert(cursor);
  });

  it('should be able to find the parked homepage', function(done){
    var cursor = apos.pages.find(apos.tasks.getAnonReq(), { slug: '/' });

    cursor.toObject(function(err, page){
      assert(!err);
      // There should be only 1 result.
      assert(page);
      // It should have a path of /
      assert(page.path === '/');
      assert(page.rank === 0);
      done();
    });
  });


  it('should be able to find just a single page', function(done){
    var cursor = apos.pages.find(apos.tasks.getAnonReq(), { slug: '/child' });

    cursor.toObject(function(err, page){
      assert(!err);
      // There should be only 1 result.
      assert(page);
      // It should have a path of /parent/child
      assert(page.path === '/parent/child');
      done();
    });
  });

  it('should be able to include the ancestors of a page', function(done){
    var cursor = apos.pages.find(apos.tasks.getAnonReq(), { slug: '/child' });

    cursor.ancestors(true).toObject(function(err, page){
      assert(!err);
      // There should be only 1 result.
      assert(page);
      // There should be 2 ancestors.
      assert(page._ancestors.length === 2);
      // The first ancestor should be the homepage
      assert.equal(page._ancestors[0].path, '/');
      // The second ancestor should be 'parent'
      assert.equal(page._ancestors[1].path, '/parent');
      done();
    });
  });

  it('should be able to include just one ancestor of a page, i.e. the parent', function(done) {
    var cursor = apos.pages.find(apos.tasks.getAnonReq(), { slug: '/child' });

    cursor.ancestors({ depth: 1 }).toObject(function(err, page){
      assert(!err);
      // There should be only 1 result.
      assert(page);
      // There should be 1 ancestor returned.
      assert(page._ancestors.length === 1);
      // The first ancestor returned should be 'parent'
      assert.equal(page._ancestors[0].path, '/parent');
      done();
    });
  });

  it('should be able to include the children of the ancestors of a page', function(done){
    var cursor = apos.pages.find(apos.tasks.getAnonReq(), { slug: '/child' });

    cursor.ancestors({children: 1}).toObject(function(err, page){
      assert(!err);
      // There should be only 1 result.
      assert(page);
      // There should be 2 ancestors.
      assert(page._ancestors.length === 2);
      // The second ancestor should have children
      assert(page._ancestors[1]._children);
      // The first ancestor's child should have a path '/parent/child'
      assert.equal(page._ancestors[1]._children[0].path, '/parent/child');
      // The second ancestor's child should have a path '/parent/sibling'
      assert.equal(page._ancestors[1]._children[1].path, '/parent/sibling');
      done();
    });
  });


  //////
  // INSERTING
  //////
  it('is able to insert a new page', function(done) {
    var parentId = '1234';

    var newPage = {
      slug: '/new-page',
      published: true,
      type: 'testPage',
      title: 'New Page'
    };
    apos.pages.insert(apos.tasks.getReq(), parentId, newPage, function(err, page) {
      // did it return an error?
      assert(!err);
      //Is the path generally correct?
      assert.equal(page.path, '/parent/new-page');
      done();
    });
  });

  it('is able to insert a new page in the correct order', function(done) {
    var cursor = apos.pages.find(apos.tasks.getAnonReq(), { slug: '/new-page' });

    cursor.toObject(function(err, page){
      assert.equal(page.rank, 2);
      done();
    });
  });

  //////
  // MOVING
  //////

  it('is able to move root/parent/sibling/cousin after root/parent', function(done) {
    // 'Cousin' _id === 4312
    // 'Parent' _id === 1234
    apos.pages.move(apos.tasks.getReq(), '4312', '1234', 'after', function(err) {
      if (err) {
        console.log(err);
      }
      assert(!err);
      var cursor = apos.pages.find(apos.tasks.getAnonReq(), {_id: '4312'});
      cursor.toObject(function(err, page){
        if (err) {
          console.log(err);
        }
        assert(!err);
        //Is the new path correct?
        assert.equal(page.path, '/cousin');
        //Is the rank correct?
        assert.equal(page.rank, 1);
        return done();
      });
    });

  });

  it('is able to move root/cousin before root/parent/child', function(done) {
    // 'Cousin' _id === 4312
    // 'Child' _id === 2341
    apos.pages.move(apos.tasks.getReq(), '4312', '2341', 'before', function(err) {
      if (err) {
        console.log(err);
      }
      assert(!err);
      var cursor = apos.pages.find(apos.tasks.getAnonReq(), {_id: '4312'});
      cursor.toObject(function(err, page){
        if (err) {
          console.log(err);
        }
        assert(!err);
        //Is the new path correct?
        assert.equal(page.path, '/parent/cousin');
        //Is the rank correct?
        assert.equal(page.rank, 0);
        return done();
      });
    });
  });


  it('is able to move root/parent/cousin inside root/parent/sibling', function(done) {
    // 'Cousin' _id === 4312
    // 'Sibling' _id === 4321
    apos.pages.move(apos.tasks.getReq(), '4312', '4321', 'inside', function(err) {
      if (err) {
        console.log(err);
      }
      assert(!err);
      var cursor = apos.pages.find(apos.tasks.getAnonReq(), {_id: '4312'});
      cursor.toObject(function(err, page){
        if (err) {
          console.log(err);
        }
        assert(!err);
        //Is the new path correct?
        assert.equal(page.path, '/parent/sibling/cousin');
        //Is the rank correct?
        assert.equal(page.rank, 0);
        return done();
      });
    });

  });

  it('moving /parent into /another-parent should also move /parent/sibling', function(done) {
    apos.pages.move(apos.tasks.getReq(), '1234', '4333', 'inside', function(err) {
      if (err) {
        console.log(err);
      }
      assert(!err);
      var cursor = apos.pages.find(apos.tasks.getAnonReq(), {_id: '4321'});
      cursor.toObject(function(err, page){
        if (err) {
          console.log(err);
        }
        assert(!err);
        //Is the grandchild's path correct?
        assert.equal(page.path, '/another-parent/parent/sibling');
        return done();
      });
    });

  });


  it('should be able to serve a page', function(done){
    return request('http://localhost:7900/child', function(err, response, body){
      assert(!err);
      //Is our status code good?
      assert.equal(response.statusCode, 200);
      //Did we get our page back?
      assert(body.match(/Sing to me, Oh Muse./));
      // Does the response prove that data.home was available?
      assert(body.match(/Home: \//));
      // Does the response prove that data.home._children was available?
      assert(body.match(/Tab: \/another-parent/));
      //console.log(body);
      return done();
    })
  });

  it('should not be able to serve a nonexistent page', function(done){
    return request('http://localhost:7900/nobodyschild', function(err, response, body){
      assert(!err);
      // Is our status code good?
      assert.equal(response.statusCode, 404);
      // Does the response prove that data.home was available?
      assert(body.match(/Home: \//));
      // Does the response prove that data.home._children was available?
      assert(body.match(/Tab: \/another-parent/));
      //console.log(body);
      return done();
    })
  });

  it('should detect that the home page is an ancestor of any page except itself', function() {
    assert(
      apos.pages.isAncestorOf({
          path: '/'
        }, {
          path: '/about'
        }
      )
    );
    assert(
      apos.pages.isAncestorOf({
          path: '/'
        }, {
          path: '/about/grandkid'
        }
      )
    );
    assert(!
      apos.pages.isAncestorOf({
          path: '/'
        }, {
          path: '/'
        }
      )
    );

  });

  it('should detect a tab as the ancestor of its great grandchild but not someone else\'s', function() {
    assert(
      apos.pages.isAncestorOf({
          path: '/about'
        }, {
          path: '/about/test/thing'
        }
      )
    );

    assert(
      !apos.pages.isAncestorOf({
          path: '/about'
        }, {
          path: '/wiggy/test/thing'
        }
      )
    );

  });

  it('is able to move parent to the trash', function(done) {
    apos.pages.moveToTrash(apos.tasks.getReq(), '1234', function(err) {
      if (err) {
        console.error(err);
      }
      assert(!err);
      var cursor = apos.pages.find(apos.tasks.getAnonReq(), {_id: '1234'});
      cursor.toObject(function(err, page){
        if (err) {
          console.log(err);
        }
        assert(!err);
        assert(!page);
        var cursor2 = apos.pages.find(apos.tasks.getAnonReq(), { _id: '1234' }).
          permission(false).trash(null).toObject(function(err, page) {
            assert.equal(page.path, '/trash/parent');
            assert(page.trash);
            assert.equal(page.level, 2);
            return done();
          }
        );
      });
    });
  });
});
