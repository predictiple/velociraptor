package memcache

import (
	"io/ioutil"
	"os"
	"testing"

	"github.com/stretchr/testify/suite"
	"www.velocidex.com/golang/velociraptor/config"
	config_proto "www.velocidex.com/golang/velociraptor/config/proto"
	"www.velocidex.com/golang/velociraptor/file_store/path_specs"
	"www.velocidex.com/golang/velociraptor/vtesting/assert"
)

type MemcacheTestSuite struct {
	suite.Suite

	config_obj *config_proto.Config
	file_store *MemcacheFileStore
}

func (self *MemcacheTestSuite) TestFileReadWrite() {
	filename := path_specs.NewSafeFilestorePath("test", "foo")
	fd, err := self.file_store.WriteFile(filename)
	assert.NoError(self.T(), err)

	// Write some data.
	data := "Some data"
	_, err = fd.Write([]byte(data))
	assert.NoError(self.T(), err)

	// Close the file.
	fd.Close()

	read_fd, err := self.file_store.ReadFile(filename)

	// Expect an error because the file did not hit the disk yet.
	assert.Error(self.T(), err)

	// Make sure it is flushed now.
	fd.Flush()
	read_fd, err = self.file_store.ReadFile(filename)
	assert.NoError(self.T(), err)
	out, err := ioutil.ReadAll(read_fd)
	assert.NoError(self.T(), err)
	assert.Equal(self.T(), string(out), data)
}

func TestMemcacheFileStore(t *testing.T) {
	// Make a tempdir
	var err error
	dirname, err := ioutil.TempDir("", "datastore_test")
	assert.NoError(t, err)
	defer os.RemoveAll(dirname) // clean up

	config_obj := config.GetDefaultConfig()
	config_obj.Datastore.Implementation = "MemcacheFileDataStore"
	config_obj.Datastore.MemcacheWriteMutationBuffer = -1
	config_obj.Datastore.FilestoreDirectory = dirname
	config_obj.Datastore.Location = dirname

	// Clear the cache between runs
	fs := NewMemcacheFileStore(config_obj)
	suite.Run(t, &MemcacheTestSuite{
		file_store: fs,
		config_obj: config_obj,
	})
}