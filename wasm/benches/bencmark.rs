use criterion::{criterion_group, criterion_main, Criterion};
use wasm::breadth_first_search;

fn bench_breadth_first_search(c: &mut Criterion) {
    c.bench_function("breadth_first_search", |b| {
        b.iter(|| {
            // Use black_box to prevent compiler optimizations
            breadth_first_search(
                std::hint::black_box(&[1, 3, 3]), // Blocked cells
                std::hint::black_box(4),          // Width
                std::hint::black_box(4),          // Height
                std::hint::black_box(0),          // Start
                std::hint::black_box(15),         // End
            )
        });
    });
}

criterion_group!(benches, bench_breadth_first_search);
criterion_main!(benches);
