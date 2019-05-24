module.exports = function (grunt) {

  require('load-grunt-tasks')(grunt);

  grunt.loadNpmTasks('grunt-execute');
  grunt.loadNpmTasks('grunt-contrib-clean');

  grunt.initConfig({

    clean: ["dist"],

    copy: {
      src_to_dist: {
        files: [{
          cwd: 'src',
          expand: true,
          src: ['**/lib/*','README.md'],
          dest: 'dist'
        },{
          cwd: 'src',
          expand: true,
          src: ['**/lib/*'],
          dest: 'dist/test'
        },{
          cwd: 'src',
          expand: true,
          src: ['**/*', '!**/*.js', '!**/*.scss'],
          dest: 'dist'
        }]
      }
    },

    watch: {
      rebuild_all: {
        files: ['src/**/*'],
        tasks: ['default'],
        options: { spawn: false }
      }
    },

    babel: {
      options: {
        sourceMap: true,
        presets: ['env'],
        plugins: ['transform-object-rest-spread']
      },
      dist: {
        files: [{
          cwd: 'src',
          expand: true,
          src: ['**/*.js', '!**/lib/*.js'],
          dest: 'dist',
          ext: '.js'
        }]
      },
      distTestNoSystemJs: {
        files: [{
          cwd: 'src',
          expand: true,
          src: ['**/*.js', '!**/lib/*.js'],
          dest: 'dist/test',
          ext: '.js'
        }]
      },
      distTestsSpecsNoSystemJs: {
        files: [{
          expand: true,
          cwd: 'spec',
          src: ['**/*.js', '!**/lib/*.js'],
          dest: 'dist/test/spec',
          ext: '.js'
        }]
      }
    },

    mochaTest: {
      test: {
        options: {
          reporter: 'spec'
        },
        src: ['dist/test/spec/test-main.js', 'dist/test/spec/*_spec.js']
      }
    }
  });

  grunt.registerTask('default', ['clean', 'copy',  'babel','watch']);
};
