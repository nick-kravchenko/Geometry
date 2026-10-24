use geometry::wasm_breadth_first_search;

#[test]
fn exported_bfs_finds_path() {
    // 3x2 grid, wall at (1,0) forces the path down and back up
    let grid = [0, 1, 0, 0, 0, 0];
    assert_eq!(wasm_breadth_first_search(&grid, 3, 2, 0, 2), vec![0, 3, 4, 5, 2]);
}

#[test]
fn exported_bfs_returns_empty_when_unreachable() {
    assert!(wasm_breadth_first_search(&[0, 1, 0], 3, 1, 0, 2).is_empty());
}
